"use client";

import { MapStand } from "./ArenaMap";
import { StandBusyness } from "@/lib/square/busyness";
import BusynessMeter from "./BusynessMeter";

/**
 * One stand on the home screen: photo, name, what it sells, how you get it,
 * and how busy it is. Closed stands render dimmed and sort to the bottom, but
 * stay tappable — a fan should be able to read a menu before the stand opens.
 */
export default function StandCard({
  stand,
  busyness,
  sells,
  inSeatSection,
  onOpen,
}: {
  stand: MapStand;
  busyness: StandBusyness | null | undefined;
  sells: string | null;
  inSeatSection: string;
  onOpen: (locationId: string) => void;
}) {
  const name = stand.fanName ?? stand.displayName;
  const fulfillment =
    stand.role === "in_seat" ? `Delivered to your seat · section ${inSeatSection} area` : "Pick up at the stand";

  return (
    <button
      type="button"
      onClick={() => onOpen(stand.locationId)}
      className={`stand-card an-tap ${stand.isOpen ? "" : "is-closed"}`}
      aria-label={`${name}. ${fulfillment}. ${stand.isOpen ? "Open" : "Closed"}. View menu`}
    >
      {stand.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="stand-card-photo" src={stand.photoUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="stand-card-photo is-placeholder" aria-hidden="true">
          <span className="stand-card-initial an-display">{name.charAt(0)}</span>
        </span>
      )}
      <span className="stand-card-body">
        <span className="stand-card-top">
          <span className="stand-card-name an-display">{name}</span>
          {!stand.isOpen && <span className="stand-card-chip an-label">Closed</span>}
        </span>
        {sells && <span className="stand-card-sells">{sells}</span>}
        <span className="stand-card-fulfil">{fulfillment}</span>
        <span className="stand-card-meter">
          <BusynessMeter busyness={busyness} />
        </span>
      </span>
      <span className="stand-card-go" aria-hidden="true">›</span>
    </button>
  );
}
