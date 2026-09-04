"use client";

import React, { useEffect, useState, type FC, type KeyboardEvent, type MouseEvent } from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type DockItem = {
  id: string;
  label: string;
  Icon: React.ElementType;
  /** Optional accent used for selected icon + indicator */
  color?: string;
  "aria-label"?: string;
};

type DockProps = {
  items: DockItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  /** Accessible name for the dock landmark */
  "aria-label"?: string;
  /** `sm` = compact mini-dock for launcher workspace rows */
  size?: "default" | "sm";
  /** Hide the selected indicator dot (useful on launcher previews) */
  showIndicator?: boolean;
};

const dockSpring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 22,
  mass: 0.7,
};

const bounceSpring: Transition = {
  type: "spring",
  stiffness: 550,
  damping: 15,
  mass: 1.1,
};

const reducedTransition: Transition = { duration: 0 };

export const Dock: FC<DockProps> = ({
  items,
  selectedId = null,
  onSelect,
  className,
  "aria-label": ariaLabel = "Applications",
  size = "default",
  showIndicator = true,
}) => {
  const reduceMotion = useReducedMotion();
  const [animateSelected, setAnimateSelected] = useState<string | null>(null);
  const compact = size === "sm";

  useEffect(() => {
    if (!animateSelected) return;
    const t = window.setTimeout(() => setAnimateSelected(null), 220);
    return () => window.clearTimeout(t);
  }, [animateSelected]);

  function handleSelect(id: string) {
    setAnimateSelected(id);
    onSelect?.(id);
  }

  function onItemClick(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    handleSelect(id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = items.findIndex((i) => i.id === selectedId);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const next = items[(Math.max(idx, 0) + 1) % items.length];
      handleSelect(next.id);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const prev = items[(idx <= 0 ? items.length : idx) - 1];
      handleSelect(prev.id);
    } else if (e.key === "Enter" || e.key === " ") {
      if (selectedId) {
        e.preventDefault();
        e.stopPropagation();
        handleSelect(selectedId);
      }
    }
  }

  const hoverY = reduceMotion ? 0 : compact ? -2 : -4;
  const selectY = reduceMotion ? 0 : compact ? -3 : -6;
  const selectScale = reduceMotion ? 1 : compact ? 1.15 : 1.3;
  const transition = reduceMotion ? reducedTransition : bounceSpring;

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("pointer-events-auto", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div
        layout={!reduceMotion}
        transition={reduceMotion ? reducedTransition : dockSpring}
        role="list"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          "relative flex items-end rounded-3xl border-[1.5px] shadow-sm",
          "border-[color:var(--border)] bg-[color:var(--surface)]",
          "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
          compact ? "gap-1.5 px-2 pt-1.5 pb-2" : "gap-3.5 px-3 pt-2 pb-3",
        )}
      >
        {items.map((item) => {
          const isSelected = selectedId === item.id;
          const accent = item.color || "var(--accent)";
          const label = item["aria-label"] || item.label;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <motion.button
                  type="button"
                  role="listitem"
                  aria-label={label}
                  aria-current={isSelected ? "page" : undefined}
                  onClick={(e) => onItemClick(e, item.id)}
                  className="relative border-0 bg-transparent p-0"
                  style={{ transformOrigin: "bottom" }}
                  initial={false}
                  whileHover={reduceMotion ? undefined : { y: hoverY }}
                  animate={{
                    scale: animateSelected === item.id ? selectScale : 1,
                    y: animateSelected === item.id ? selectY : 0,
                  }}
                  transition={transition}
                >
                  <motion.div
                    className={cn(
                      "flex cursor-pointer items-center justify-center rounded-xl",
                      "bg-[color:var(--surface-2)]",
                      "focus-visible:outline-none",
                      compact ? "size-8 p-1.5 rounded-lg" : "size-11 p-2",
                    )}
                    style={
                      isSelected
                        ? {
                            boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${accent} 55%, transparent)`,
                            background: `color-mix(in srgb, ${accent} 14%, var(--surface-2))`,
                          }
                        : undefined
                    }
                  >
                    <item.Icon
                      aria-hidden
                      className={cn(
                        "transition-colors duration-200",
                        compact ? "size-4" : "size-[22px]",
                      )}
                      style={{
                        color: isSelected ? accent : "var(--muted)",
                        strokeWidth: isSelected ? 2.25 : 1.75,
                      }}
                    />
                  </motion.div>

                  {showIndicator && (
                    <span
                      className={cn(
                        "pointer-events-none absolute inset-x-0 flex items-center justify-center",
                        compact ? "-bottom-1" : "-bottom-1.5",
                        "opacity-0 transition-opacity duration-200",
                        isSelected && "opacity-100",
                      )}
                      aria-hidden
                    >
                      <span
                        className="rounded-full"
                        style={{
                          width: compact ? 3 : 4,
                          height: compact ? 3 : 4,
                          background: isSelected ? accent : "var(--muted)",
                        }}
                      />
                    </span>
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={compact ? 6 : 10}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </motion.div>
    </nav>
  );
};
