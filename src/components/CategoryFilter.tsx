"use client";

import { FanCategory, CATEGORY_OPTIONS } from "@/lib/categories";

interface CategoryFilterProps {
  selected: FanCategory;
  onChange: (category: FanCategory) => void;
}

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
      {CATEGORY_OPTIONS.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0"
            style={{
              backgroundColor: isActive ? "var(--btn-active-bg)" : "var(--btn-bg)",
              color: isActive ? "var(--btn-active-text)" : "var(--btn-text)",
              border: isActive
                ? "1px solid var(--btn-active-border)"
                : "1px solid var(--btn-border)",
              transition: "all 0.2s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
