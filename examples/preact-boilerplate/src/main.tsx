import { hydrate, prerender as ssr } from "preact-iso";
import { App } from "./app";
import "./styles/globals.css";

if (typeof window !== "undefined") {
  hydrate(<App />, document.getElementById("app")!);
}

export async function prerender(data: unknown) {
  return await ssr(<App {...(data as object)} />);
}
