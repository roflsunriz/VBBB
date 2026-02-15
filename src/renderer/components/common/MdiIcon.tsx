/**
 * Material Design Icon wrapper component.
 * Uses @mdi/js for tree-shakable SVG paths.
 */
interface MdiIconProps {
  readonly path: string;
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

export function MdiIcon({ path, size = 18, className = '' }: MdiIconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline-block shrink-0 fill-current ${className}`}
      role="img"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
