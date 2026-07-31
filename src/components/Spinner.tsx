import React from 'react';

interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 24,
  className = '',
  style,
  ...props
}) => {
  const isNumberSize = typeof size === 'number';
  const widthVal = isNumberSize ? `${size}px` : size;
  const heightVal = isNumberSize ? `${size}px` : size;

  const hasSizeClasses = /\b(w-|h-)/.test(className);

  return (
    <svg
      viewBox="0 0 50 50"
      className={`inline-block animate-spin text-brand-primary shrink-0 ${className}`}
      style={{
        ...(!hasSizeClasses ? { width: widthVal, height: heightVal } : {}),
        ...style,
      }}
      {...props}
    >
      {/* Outer subtle track ring */}
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-15 dark:opacity-20"
      />
      {/* Outer active arc segment */}
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="35 90"
        strokeDashoffset="0"
      />

      {/* Inner subtle track ring */}
      <circle
        cx="25"
        cy="25"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="opacity-15 dark:opacity-20"
      />
      {/* Inner active arc segment */}
      <circle
        cx="25"
        cy="25"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="22 60"
        strokeDashoffset="-40"
      />
    </svg>
  );
};

export default Spinner;
