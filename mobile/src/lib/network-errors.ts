// The Wi-Fi hint only applies when testing against an API on a computer on the same network
// (http:// on localhost or a private LAN address). The released app talks to the hosted server.
export function isLocalDevelopmentApi(baseUrl: string) {
  try {
    const { protocol, hostname } = new URL(baseUrl);
    return (
      protocol === 'http:' &&
      (hostname === 'localhost' || hostname === '127.0.0.1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname))
    );
  } catch {
    return false;
  }
}

export function unreachableMessage(upload: boolean, baseUrl: string) {
  if (isLocalDevelopmentApi(baseUrl)) {
    return 'AgriMarket could not reach the service. Check that your phone and computer are on the same Wi-Fi and that the API is running.';
  }
  return upload
    ? 'The upload was interrupted. Check your internet connection and try again. If AgriMarket was idle, the server can take up to a minute to wake up.'
    : 'AgriMarket could not be reached. Check your internet connection and try again. If AgriMarket was idle, the server can take up to a minute to wake up.';
}
