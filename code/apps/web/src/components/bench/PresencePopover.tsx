"use client";

interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  activity: string;
  seen: string;
}

interface Props {
  person: Person | null;
  onClose: () => void;
}

export default function PresencePopover({ person, onClose }: Props) {
  if (!person) return null;

  return (
    <div className="absolute top-14 right-4 z-50 w-64 border border-black rounded-[18px] bg-white animate-silo-rise shadow-lg">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="w-10 h-10 rounded-full border border-black flex items-center justify-center text-sm font-bold"
            style={{ background: person.color }}
          >
            {person.initials}
          </span>
          <div>
            <div className="text-sm font-semibold">{person.name}</div>
            <div className="text-[11px] text-neutral-500">{person.role}</div>
          </div>
        </div>
        <div className="text-[12px] text-neutral-600 mb-1">{person.activity}</div>
        <div className="text-[11px] text-neutral-400">{person.seen}</div>
      </div>
      <div className="border-t border-neutral-200 px-4 py-2">
        <button
          onClick={onClose}
          className="text-[11px] text-neutral-500 cursor-pointer hover:text-black"
        >
          Close
        </button>
      </div>
    </div>
  );
}
