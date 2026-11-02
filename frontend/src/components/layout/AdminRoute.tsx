import { Outlet } from 'react-router-dom';

/**
 * In the Shared Factory Terminal architecture, all connected users possess complete
 * functionality without role barriers. AdminRoute acts as a clean pass-through.
 */
export default function AdminRoute() {
  return <Outlet />;
}
