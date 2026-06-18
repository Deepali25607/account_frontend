import TxnModule from "../components/TxnModule";

export default function Sales() {
  return (
    <TxnModule cfg={{
      kind: "sale",
      endpoint: "sales",
      title: "Sales",
      subtitle: "Invoices & credit notes — stock and receivables update automatically",
      newLabel: "New sale",
      returnLabel: "Credit note",
      partyResource: "customers",
      partyKey: "customer_id",
      partyNameKey: "customer_name",
      partyLabel: "Customer",
      paymentKey: "received",
      paymentLabel: "Amount received",
    }} />
  );
}
