import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Search as SearchIcon, Server, LayoutGrid, DoorOpen, Building2, Globe, Monitor } from "lucide-react";
import { useSearch, SearchHit } from "@/api/search";
import { Spinner } from "@/components/common/Spinner";
import { cn } from "@/lib/utils";

const ENTITY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  device: Server,
  rack: LayoutGrid,
  room: DoorOpen,
  datacenter: Building2,
  ip_address: Globe,
  vm: Monitor,
};

const ENTITY_LABELS: Record<string, string> = {
  device: "Device",
  rack: "Rack",
  room: "Room",
  datacenter: "Datacenter",
  ip_address: "IP Address",
  vm: "Virtual Machine",
};

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  device: (id) => `/devices/${id}`,
  rack: (id) => `/racks?highlight=${id}`,
  room: (id) => `/rooms?highlight=${id}`,
  datacenter: (id) => `/datacenters?highlight=${id}`,
  ip_address: (id) => `/ip-space?highlight=${id}`,
  vm: (id) => `/virtual?highlight=${id}`,
};

function HitRow({ hit }: { hit: SearchHit }) {
  const navigate = useNavigate();
  const Icon = ENTITY_ICONS[hit.entity_type] ?? SearchIcon;
  const route = ENTITY_ROUTES[hit.entity_type]?.(hit.entity_id);

  return (
    <button
      onClick={() => route && navigate(route)}
      className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 text-left transition-colors"
    >
      <div className="mt-0.5 p-1.5 rounded-md bg-blue-50 text-blue-600 shrink-0">
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{hit.label}</span>
          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
            {ENTITY_LABELS[hit.entity_type] ?? hit.entity_type}
          </span>
        </div>
        {hit.sublabel && (
          <p className="text-sm text-gray-500 truncate mt-0.5">{hit.sublabel}</p>
        )}
      </div>
    </button>
  );
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [input, setInput] = useState(initialQ);
  const [query, setQuery] = useState(initialQ);

  const { data, isFetching, isError } = useSearch(query);

  // Sync URL → state when user navigates back/forward
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setInput(q);
    setQuery(q);
  }, [searchParams]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) {
      setSearchParams({ q: trimmed });
      setQuery(trimmed);
    }
  }

  // Group results by entity_type
  const grouped = (data?.results ?? []).reduce<Record<string, SearchHit[]>>((acc, hit) => {
    (acc[hit.entity_type] ??= []).push(hit);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Global Search</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative">
          <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search devices, IPs, VMs, racks…"
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {isFetching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner size="sm" />
            </div>
          )}
        </div>
      </form>

      {isError && (
        <p className="text-sm text-red-600">Search failed. Please try again.</p>
      )}

      {query && !isFetching && data && data.total === 0 && (
        <p className="text-sm text-gray-500">
          No results for <span className="font-medium">&ldquo;{query}&rdquo;</span>.
        </p>
      )}

      {data && data.total > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            {data.total} result{data.total !== 1 ? "s" : ""} for{" "}
            <span className="font-medium">&ldquo;{data.query}&rdquo;</span>
          </p>

          {groupKeys.map((type) => (
            <div key={type}>
              <h2 className={cn(
                "text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 px-1"
              )}>
                {ENTITY_LABELS[type] ?? type}s
              </h2>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {grouped[type].map((hit) => (
                  <HitRow key={hit.entity_id} hit={hit} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
