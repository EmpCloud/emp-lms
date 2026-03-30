export function BackToDashboard() {
  const isSSO = localStorage.getItem('sso_source') === 'empcloud';
  if (!isSSO) return null;

  const returnUrl =
    localStorage.getItem('empcloud_return_url') ||
    'https://test-empcloud.empcloud.com/dashboard';

  return (
    <a
      href={returnUrl}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
    >
      <span>&larr; EMP Cloud</span>
    </a>
  );
}
