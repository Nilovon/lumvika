import type { LucideIcon } from '@/lib/icons'
import { Boxes, Clapperboard, Home, Layers, ListChecks, Megaphone, Scale, ShoppingBagIcon, TrendingUpIcon, UserPlus } from '@/lib/icons'
import type { TemplateCategory } from '@rerun/contracts'

// The glyph that names each category on the library's shelves. Exhaustive like the art map next to
// it: a category added to the contract fails to compile until someone picks its icon. The landing's
// menu draws the same ten in the duo pack, which apps/ui does not install, so only the wording is
// shared and the glyphs are picked twice.
export const TEMPLATE_CATEGORY_ICONS: Record<TemplateCategory, LucideIcon> = {
    agencies: Megaphone,
    ecommerce: ShoppingBagIcon,
    saas: Layers,
    sales: TrendingUpIcon,
    recruiting: UserPlus,
    'real-estate': Home,
    legal: Scale,
    creators: Clapperboard,
    productivity: ListChecks,
    other: Boxes,
}
