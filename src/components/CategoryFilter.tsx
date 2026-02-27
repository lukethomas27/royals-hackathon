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
              backgroundColor: isActive ? "#c5a94e" : "#1e293b",
              color: isActive ? "#1a2744" : "#94a3b8",
              border: isActive ? "1px solid #c5a94e" : "1px solid #334155",
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
