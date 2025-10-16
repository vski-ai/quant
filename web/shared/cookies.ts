import { getCookies, setCookie } from "@std/http";

export enum Cookie {
  UI_THEME = "a",
  UI_DENSE = "b",
  UI_ASIDE = "c",
  UI_SCREEN = "d",
  APP_SESSION = "e",
  PERIOD = "q_period",
  GRANULARITY = "q_granularity",
}

export const getCookie = (
  headers: Headers,
  name: Cookie,
): string | undefined => {
  const cookies = getCookies(headers);
  return cookies[name];
};

export const setCookieHeader = (
  headers: Headers,
  name: Cookie,
  value: string,
  options: {
    path?: string;
    maxAge?: number;
    httpOnly?: boolean;
  } = {},
) => {
  setCookie(headers, {
    name,
    value,
    path: options.path ?? "/",
    maxAge: options.maxAge ?? 31536000, // 1 year
    httpOnly: options.httpOnly,
  });
};
