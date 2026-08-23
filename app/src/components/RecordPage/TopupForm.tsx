"use client";

interface TopupFormProps {
  blockId: string;
  buried: boolean;
}

export function TopupForm({ blockId, buried }: TopupFormProps) {
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const amount = parseFloat((form.elements.namedItem("amount_usd") as HTMLInputElement).value);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "topup", block_id: blockId, amount_usd: amount }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="border border-tower-border rounded p-4 bg-tower-surface/30">
      <h3 className="text-tower-text font-medium mb-2">Top up altitude</h3>
      <p className="text-tower-muted text-xs mb-3">
        {buried
          ? "This block is buried. Top up to rise above ground."
          : "Add more altitude to stay ahead of the rising ground."}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <input
            type="number"
            name="amount_usd"
            min="2"
            step="1"
            defaultValue="10"
            className="bg-tower-surface border border-tower-border rounded px-3 py-1.5 text-tower-text text-sm w-24"
            aria-label="Amount in USD"
          />
          <button
            type="submit"
            className="bg-tower-sky hover:bg-sky-600 text-tower-base font-bold text-sm px-4 py-1.5 rounded transition-colors"
          >
            Top up
          </button>
        </div>
      </form>
    </div>
  );
}
