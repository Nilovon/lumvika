'use client'

import { Icon } from '@/components/ui/icon'
import type { TemplateStep } from '@/lib/templates/useTemplateCta'
import { Stripes } from '@lumvika/ui/primitives'

// Ce qui va se passer, dans l'ordre, quand le bouton ne fait pas tout d'un coup : payer un plan,
// payer la template, poser les agents. Le libellé du bouton ne dit que l'étape suivante, cette
// liste dit le reste — c'est elle qui empêche un « Start free trial » de ressembler à un abonnement
// sans rapport avec la template qu'on regarde.
export function TemplateInstallSteps({ steps }: { steps: TemplateStep[] }) {
    if (steps.length < 2) return null

    return (
        // Une colonne de rangées compactes sur téléphone, deux cartes empilées à partir de sm :
        // ce bloc vit dans le footer de la fiche, au-dessus du bouton d'achat, et trois cartes
        // hautes y prenaient plus de la moitié de la sheet — il ne restait plus de fiche à lire.
        // L'icône passe à gauche du texte au lieu d'au-dessus, ce qui coûte une ligne par étape.
        <ol className="mb-3 grid gap-2 sm:grid-cols-2">
            {steps.map(step => (
                <li
                    key={step.label}
                    className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 overflow-hidden rounded-lg border border-border bg-card p-2.5 sm:flex sm:flex-col sm:items-start sm:gap-1.5 sm:p-3"
                >
                    <Stripes />
                    {/* `relative` sinon les hachures, absolues, se peindraient par-dessus le texte
                        (la variante d'Icon le porte déjà). En grille l'icône couvre les deux
                        lignes du texte ; les `row-span`/`col-start` sont inertes dès le `sm:flex`. */}
                    <Icon icon={step.icon} size="sm" className="row-span-2" />
                    <p className="relative text-sm font-medium leading-tight text-foreground">{step.label}</p>
                    <p className="relative col-start-2 text-xs leading-snug text-muted-foreground">{step.caption}</p>
                </li>
            ))}
        </ol>
    )
}
