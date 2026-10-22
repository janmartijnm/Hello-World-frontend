import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="state">
      Page not found. <Link to="/">Back to the overview</Link>
    </div>
  );
}
