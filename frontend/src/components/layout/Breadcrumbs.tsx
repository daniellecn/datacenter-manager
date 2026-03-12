import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface Crumb {
  label: string;
  to?: string;
}

interface BreadcrumbsProps {
  crumbs?: Crumb[];
}

export function Breadcrumbs({ crumbs }: BreadcrumbsProps) {
  if (!crumbs || crumbs.length === 0) return null;
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
          {crumb.to ? (
            <Link to={crumb.to} className="hover:text-blue-600 transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-gray-800 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
