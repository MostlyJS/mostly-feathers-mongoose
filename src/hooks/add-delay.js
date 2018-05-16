export default function addDelay (delay) {
  return (context, next) => {
    setTimeout(next, delay);
  };
}
