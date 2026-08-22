import type { Metadata } from "next";
import OrangeSubmissionBanner from "./OrangeSubmissionBanner";
import PayClient from "./PayClient";

export const metadata: Metadata = {
  title: "AIAC Pay | MTN MoMo & Orange Money",
  description: "Passerelle de paiement AIAC Pay — MTN Mobile Money Collections et Orange Money Web Payment au Cameroun",
};

export default function AiacPayPage() {
  return (
    <>
      <OrangeSubmissionBanner />
      <PayClient />
    </>
  );
}
