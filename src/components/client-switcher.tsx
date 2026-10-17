'use client';
import { usePathname, useRouter } from 'next/navigation';
export function ClientSwitcher({
  current,
  clients,
}: {
  current: string;
  clients: { name: string; slug: string }[];
}) {
  const router = useRouter();
  const path = usePathname();
  return (
    <label className="text-xs">
      Client
      <select
        value={current}
        onChange={(e) =>
          router.push(
            `/c/${e.target.value}/${path.includes('/imports') ? 'imports' : path.includes('/settings') ? 'settings' : 'dashboard'}`,
          )
        }
      >
        {clients.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
