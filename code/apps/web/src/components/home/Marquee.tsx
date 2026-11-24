"use client";

export default function Marquee() {
  const text = "SILO · DEPLOY · COLLABORATE · BUILD · ";
  const repeated = text.repeat(8);

  return (
    <div className="w-full overflow-hidden bg-black text-white border-b border-black select-none">
      <div className="animate-silo-marquee whitespace-nowrap py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider">{repeated}</span>
      </div>
    </div>
  );
}
