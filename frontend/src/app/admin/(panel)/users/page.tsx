"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BanBadge } from "@/components/admin/BanBadge";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { AdminUserListItem } from "@/lib/types/adminUser";

// A8 (04 "Users Management"): every user, searched on the server by username or e-mail.
export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    // Wait for a pause in typing before searching.
    const timer = setTimeout(() => {
      api<{ users: AdminUserListItem[] }>(`/admin/users?q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          setUsers(r.users);
          setError(false);
        })
        .catch(() => setError(true));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="w-full px-6 py-8 wide:mx-auto wide:max-w-[1200px]">
      <h1 className="text-3xl font-semibold text-text">Users</h1>
      <p className="mt-2 text-muted">Everyone with an account. Open a user to see their attempts or ban them.</p>

      <div role="search" className="relative mt-8 w-full sm:max-w-[536px]">
        <Icon
          name="search"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username or email..."
          aria-label="Search users"
          className="w-full rounded border border-border bg-surface py-2.5 pl-11 pr-3 text-sm text-text placeholder:text-muted focus:border-action focus:outline-none"
        />
      </div>

      {error ? (
        <p className="mt-8 text-sm text-failed">Could not load the users. Reload the page.</p>
      ) : !users ? (
        <p className="mt-8 text-sm text-muted">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="mt-8 rounded border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          {q.trim() ? "No users match this search." : "Nobody has signed up yet."}
        </p>
      ) : (
        <>
          <table className="mt-7 w-full table-fixed text-left text-sm">
            <thead className="bg-surface text-[11px] font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="rounded-l px-3 py-3 sm:px-4">
                  User
                </th>
                <th scope="col" className="hidden w-32 px-3 py-3 md:table-cell">
                  Level
                </th>
                <th scope="col" className="hidden w-36 px-3 py-3 lg:table-cell">
                  Joined
                </th>
                <th scope="col" className="hidden w-36 px-3 py-3 lg:table-cell">
                  Last active
                </th>
                <th scope="col" className="w-24 px-3 py-3">
                  Status
                </th>
                <th scope="col" className="w-16 rounded-r px-3 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border align-top">
                  <td className="px-3 py-4 sm:px-4">
                    <p className="truncate text-[15px] text-text">{u.username}</p>
                    <p className="mt-1 truncate text-xs text-muted">{u.email}</p>
                    {/* Columns hidden at this width move here. */}
                    <p className="mt-1 text-xs text-muted lg:hidden">
                      <span className="md:hidden">{u.level} · </span>
                      Joined {formatDate(u.joinedAt)}
                    </p>
                  </td>
                  <td className="hidden px-3 py-4 text-text md:table-cell">{u.level}</td>
                  <td className="hidden px-3 py-4 text-muted lg:table-cell">{formatDate(u.joinedAt)}</td>
                  <td className="hidden px-3 py-4 text-muted lg:table-cell">
                    {u.lastActiveAt ? formatDate(u.lastActiveAt) : "—"}
                  </td>
                  <td className="px-3 py-4">
                    <BanBadge banned={u.isBanned} />
                  </td>
                  <td className="px-3 py-4">
                    <Link
                      href={`/admin/users/${u.id}`}
                      aria-label={`View ${u.username}`}
                      className="text-action hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-muted">Showing {users.length}</p>
        </>
      )}
    </div>
  );
}
