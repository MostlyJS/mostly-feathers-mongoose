export function getHookData(context) {
  const items = context.type === 'before'? context.data : context.result;
  return (items && items.data) || items;
}

export function setHookData(context, items) {
  if (context.type === 'before') {
    context.data = items;
  } else if (context.result && context.result.data) {
    context.result.data = items;
  } else {
    context.result = items;
  }
}