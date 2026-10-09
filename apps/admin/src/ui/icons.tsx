import type { ReactNode, SVGProps } from 'react';

/**
 * Inline SVG icons (24×24, stroke = currentColor). Decorative by default: whoever uses them
 * puts the accessible name on the button or link, not on the icon.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function make(paths: ReactNode) {
  return function Icon({ size = 20, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const IconOrders = make(
  <>
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </>,
);
export const IconHistory = make(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </>,
);
export const IconBilling = make(
  <>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M2.5 10h19M6.5 15h4" />
  </>,
);
export const IconMenuBook = make(
  <>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
  </>,
);
export const IconLocation = make(
  <>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </>,
);
export const IconStar = make(
  <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
);
export const IconUsers = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 20a6.5 6.5 0 0 0-3-5.5" />
  </>,
);
export const IconChart = make(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />);
export const IconLogout = make(
  <>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  </>,
);
export const IconSidebar = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>,
);
export const IconHamburger = make(<path d="M4 6h16M4 12h16M4 18h16" />);
export const IconClose = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IconVolume = make(
  <>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </>,
);
export const IconVolumeOff = make(
  <>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="m16 9 6 6M22 9l-6 6" />
  </>,
);
export const IconRefresh = make(
  <>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
    <path d="M4 3v5h5M4 13a8 8 0 0 0 14.3 4.9L20 16" />
    <path d="M20 21v-5h-5" />
  </>,
);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconArrowRight = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconAlert = make(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);
export const IconBag = make(
  <>
    <path d="M5 8h14l-1 13H6z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </>,
);
export const IconUtensils = make(
  <>
    <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10" />
    <path d="M17 21V3c-2 1.5-3 4-3 7v3h3" />
  </>,
);
export const IconTruck = make(
  <>
    <path d="M2 6h11v10H2zM13 10h4l3 3v3h-7" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </>,
);
export const IconPhone = make(
  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
);
export const IconNote = make(
  <>
    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>,
);
export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const IconInbox = make(
  <>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
  </>,
);
export const IconLock = make(
  <>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </>,
);
export const IconGlobe = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
);
export const IconBell = make(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
  </>,
);
