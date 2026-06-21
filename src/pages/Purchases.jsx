import TxnModule from "../components/TxnModule";

export default function Purchases() {
  return (
    <TxnModule cfg={{
      kind: "purchase",
      endpoint: "purchases",
      title: "Purchases",
      subtitle: "Purchase orders, goods receipt & returns — stock updates automatically",
      newLabel: "New purchase",
      returnLabel: "Purchase return",
      partyResource: "vendors",
      partyKey: "vendor_id",
      partyNameKey: "vendor_name",
      partyLabel: "Supplier",
      paymentKey: "paid",
      paymentLabel: "Amount paid",
    }} />
  );
}
