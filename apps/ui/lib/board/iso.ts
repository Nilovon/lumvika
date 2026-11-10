// La logique isométrique vit désormais dans le package partagé @rerun/ui/iso-grid.
// On ré-exporte le sous-chemin pur (sans React/client) pour les consommateurs
// existants (server actions, services, …) qui importent `@/lib/board/iso`.
export * from '@rerun/ui/iso-grid/iso'
