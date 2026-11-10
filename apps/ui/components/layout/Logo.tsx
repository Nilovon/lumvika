// Le logo Lumvika vit désormais dans le package partagé @lumvika/ui/logo (consommé aussi
// par la landing). On ré-exporte ici pour préserver les imports existants
// (`@/components/layout/Logo`).
export { Logo, AnimatedLogo, MARK_PATH } from '@lumvika/ui/logo'
