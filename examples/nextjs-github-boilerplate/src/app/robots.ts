import { cmsRobots } from "@webhouse/cms/next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export default cmsRobots({ baseUrl, strategy: "maximum" });
