import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// Caller supplies a validated accepted SVG; publication verifies the stored bytes.
async function requireDirectory(directory, label) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory, not a symlink.`);
  return await realpath(directory);
}

async function prepareIterations(logosDirectory) {
  if (!path.isAbsolute(logosDirectory)) throw new Error("--logos must be an absolute directory path.");
  const logosReal = await requireDirectory(logosDirectory, "Logos directory");
  const iterations = path.join(logosDirectory, "iterations");
  let created = false;
  try { await mkdir(iterations, { mode: 0o755 }); created = true; }
  catch (error) { if (error?.code !== "EEXIST") throw error; }
  const iterationsReal = await requireDirectory(iterations, "Iterations directory");
  if (path.dirname(iterationsReal) !== logosReal) throw new Error("Iterations directory escapes the explicit logos directory.");
  if (created) await syncDirectoryMetadata(logosReal);
  return iterationsReal;
}

async function startingIteration(iterationsDirectory) {
  let maximum = 0;
  for (const name of await readdir(iterationsDirectory)) {
    const match = /^iteration-(\d+)\.svg$/u.exec(name);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  if (!Number.isSafeInteger(maximum) || maximum >= Number.MAX_SAFE_INTEGER) throw new Error("Iteration sequence is exhausted.");
  return maximum + 1;
}

async function removeOwnedFinal(filename, device, inode) {
  try {
    const info = await lstat(filename);
    if (info.isFile() && !info.isSymbolicLink() && info.dev === device && info.ino === inode) await unlink(filename);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function syncDirectoryMetadata(directory) {
  let handle;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EOPNOTSUPP", "EBADF"].includes(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

export async function persistAcceptedSvg(svg, logosDirectory) {
  const iterations = await prepareIterations(logosDirectory);
  const bytes = Buffer.from(svg, "utf8");
  const temporary = path.join(iterations, `.lineage-handoff-${process.pid}-${randomUUID()}.tmp`);
  const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
  const file = await open(temporary, flags, 0o600);
  let finalPath;
  let tempInfo;
  try {
    await file.writeFile(bytes);
    await file.sync();
    tempInfo = await file.stat();
    await file.close();

    let iteration = await startingIteration(iterations);
    for (;;) {
      finalPath = path.join(iterations, `iteration-${iteration}.svg`);
      try { await link(temporary, finalPath); break; }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        iteration += 1;
        if (!Number.isSafeInteger(iteration)) throw new Error("Iteration sequence is exhausted.");
      }
    }

    const readFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    const publishedFile = await open(finalPath, readFlags);
    let published;
    try {
      const publishedInfo = await publishedFile.stat();
      if (!publishedInfo.isFile() || publishedInfo.dev !== tempInfo.dev || publishedInfo.ino !== tempInfo.ino) {
        throw new Error("Published iteration identity changed before verification.");
      }
      published = await publishedFile.readFile();
    } finally { await publishedFile.close(); }
    if (!published.equals(bytes)) throw new Error("Published iteration bytes do not match the accepted artifact.");
    const sha256 = createHash("sha256").update(published).digest("hex");
    await unlink(temporary);
    await syncDirectoryMetadata(iterations);
    return {
      iterationPath: path.posix.join("iterations", path.basename(finalPath)),
      bytes: published.byteLength,
      sha256,
    };
  } catch (error) {
    try { await file.close(); } catch { /* already closed */ }
    if (finalPath && tempInfo) await removeOwnedFinal(finalPath, tempInfo.dev, tempInfo.ino);
    try { await unlink(temporary); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    throw error;
  }
}
