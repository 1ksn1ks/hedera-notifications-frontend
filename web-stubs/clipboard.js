// Web stub for @react-native-clipboard/clipboard — uses the browser's
// async clipboard API with a silent fallback when it is unavailable
// (e.g. non-secure context).
export default {
  setString: (text) =>
    navigator.clipboard
      ? navigator.clipboard.writeText(String(text)).catch(() => {})
      : Promise.resolve(),
  getString: () =>
    navigator.clipboard
      ? navigator.clipboard.readText().catch(() => '')
      : Promise.resolve(''),
  setImage: () => Promise.resolve(),
};
