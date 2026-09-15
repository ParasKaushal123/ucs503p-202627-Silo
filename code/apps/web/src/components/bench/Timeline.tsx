"use client";

interface TimelineItem {
  id: string;
  title: string;
  meta: string;
  swatch: string;
  action: string;
}

interface Props {
  items: TimelineItem[];
  onAction: (item: TimelineItem) => void;
}

export default function Timeline({ items, onAction }: Props) {
  return (
    <div className="p-3 space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="border border-black rounded-[14px] p-3 flex items-center gap-3"
        >
          <span
            className="shrink-0 w-3 h-3 rounded-full border border-black"
            style={{ background: item.swatch }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold">{item.title}</div>
            <div className="text-[11px] text-neutral-500">{item.meta}</div>
          </div>
          <button
            onClick={() => onAction(item)}
            className="shrink-0 rounded-pill border border-black bg-white px-3 py-1 text-[11px] font-bold cursor-pointer hover:bg-neutral-100"
          >
            {item.action}
          </button>
        </div>
      ))}
    </div>
  );
}
