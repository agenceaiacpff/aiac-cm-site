import type { Metadata } from "next";
import PayClient from "./PayClient";

export const metadata: Metadata = {
  title: "AIAC Pay | MTN MoMo",
  description: "Passerelle de paiement AIAC Pay — test MTN Mobile Money Collections",
};

export default function AiacPayPage() {
  return <PayClient />;
}
