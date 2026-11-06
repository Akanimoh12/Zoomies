export const BoneIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 8 5" width={size} height={(size * 5) / 8} shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#F2B53A" d="M0 0h2v2H0zM0 3h2v2H0zM6 0h2v2H6zM6 3h2v2H6zM1 1h6v3H1z" />
  </svg>
);

export const SpeakerIcon = ({ off }: { off: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4z" />
    {off ? (
      <>
        <line x1="16" y1="9" x2="22" y2="15" />
        <line x1="22" y1="9" x2="16" y2="15" />
      </>
    ) : (
      <>
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </>
    )}
  </svg>
);

export const PauseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <line x1="8" y1="5" x2="8" y2="19" />
    <line x1="16" y1="5" x2="16" y2="19" />
  </svg>
);
