export default function isHeader (header, value) {
  if (!header || !value) {
    throw new Error('Calling iff() predicate incorrectly. (isHeader)');
  }

  return hook => {
    const hookHeader = ((hook.params || {}).headers || {})[header];
    if (hookHeader) {
      const enrichers = hookHeader.split(',').map(e => e.trim());
      if (value) {
        return enrichers.some(enricher => enricher === value);
      } else {
        return true;
      }
    }
    return false;
  };
}
