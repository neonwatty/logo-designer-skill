export function passed(jobs) {
  if (jobs.changes?.result !== 'success') return false;
  const { full, docs } = jobs.changes.outputs;
  if (![full, docs].every(value => ['true', 'false'].includes(value))) return false;
  return ['content', 'validate-plugin', 'validate-markdown', 'test-scripts'].every(name => {
    const required = name === 'content' || full === 'true' || (name === 'validate-markdown' && docs === 'true');
    return jobs[name]?.result === (required ? 'success' : 'skipped');
  });
}
