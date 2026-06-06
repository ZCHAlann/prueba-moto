import { useSidebar } from '../../../../context/SidebarContext';

export function useCockpitLayout() {
  const { isExpanded, isMobileOpen, isMobile } = useSidebar();

  const sidebarWidth = isMobile
    ? (isMobileOpen ? 220 : 0)
    : (isExpanded ? 220 : 60);

  return { sidebarWidth, isMobile };
}
