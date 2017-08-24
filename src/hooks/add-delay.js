export function addDelay(delay) {
  return (hook, next) => {
    setTimeout(next, delay);
  };
}
