/**
 * F191.8 — den gamle rute. Sponsorarkivet er blevet til fanen «Reklamer».
 *
 * Mappen bliver stående MED VILJE. Slettes den, fanger [slug] stien og
 * forsøger at hente et afsnit ved navn «sponsorer» — så ville en forkert URL
 * vise «afsnittet findes ikke», altså en fejl der ligner data.
 */
import { redirect } from "next/navigation";

export default function SponsorerRedirect() {
  redirect("/admin/podcast?fane=reklamer");
}
