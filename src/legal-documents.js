// Ordinary static PDFs; native anchors preserve forms and open the browser viewer.
import { SITE } from "./site-profile.js";
export const LEGAL_DOCUMENTS = Object.freeze(SITE.market === "RU" ? {privacy:"/privacy", terms:null} : {
  privacy: "/documents/privacy-policy.pdf",
  terms: "/documents/terms-of-use.pdf",
});
