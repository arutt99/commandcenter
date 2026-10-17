'use client';
import { useFormStatus } from 'react-dom';
export function PendingButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? 'Working…' : children}
    </button>
  );
}
