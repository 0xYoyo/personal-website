export interface ActivityItem {
  repo: string;
  type: string;
  at: string;
}

const EVENT_LABELS: Record<string, string> = {
  PushEvent: 'push',
  PullRequestEvent: 'pull request',
  CreateEvent: 'create',
  IssuesEvent: 'issue',
  IssueCommentEvent: 'comment',
  ReleaseEvent: 'release',
  WatchEvent: 'star',
  ForkEvent: 'fork',
  PublicEvent: 'made public',
  DeleteEvent: 'delete',
};

/**
 * Latest public GitHub activity for 0xYoyo. Resolves to null on any failure
 * (network, rate limit, unexpected shape) so callers can fall back quietly.
 */
export async function fetchRecentActivity(limit = 3, signal?: AbortSignal): Promise<ActivityItem[] | null> {
  try {
    const res = await fetch('https://api.github.com/users/0xYoyo/events/public?per_page=20', {
      headers: { Accept: 'application/vnd.github+json' },
      signal,
    });
    if (!res.ok) return null;
    const events: unknown = await res.json();
    if (!Array.isArray(events)) return null;
    return events
      .filter((e): e is { type: string; repo: { name: string }; created_at: string } =>
        Boolean(e && typeof e.type === 'string' && e.repo && typeof e.repo.name === 'string' && typeof e.created_at === 'string'),
      )
      .slice(0, limit)
      .map((e) => ({ repo: e.repo.name.replace(/^0xYoyo\//, ''), type: EVENT_LABELS[e.type] ?? e.type.replace(/Event$/, '').toLowerCase(), at: e.created_at }));
  } catch {
    return null;
  }
}
