/** La taille de l'orbe parkée dans le coin du board, et celle qu'elle prend en tête du panneau. */
export const PARKED_ORB_SIZE = 56
/**
 * Sous `md` l'orbe s'assoit sur la même ligne que le bouton Help (40px) et la barre d'outils (44px
 * de haut) : à 56px elle écrase ses voisines, à 48 elle reste la plus grosse sans les dominer, et
 * c'est encore une cible tactile confortable.
 */
export const PARKED_ORB_SIZE_MOBILE = 48
export const HEADER_ORB_SIZE = 30
/**
 * Et celle qu'elle prend dans la pile, à la place des points du loader, le temps d'un tour. 24px
 * n'est pas arbitraire : la boîte du svg vaut 1,8 fois le diamètre, donc le bloom déborde de 9,6px
 * de chaque côté, et c'est tout ce que le `px-3` de la pile peut absorber sans le raboter.
 */
export const LOADER_ORB_SIZE = 24
/** Et celle de l'orbe d'accueil, qui tient l'écran le temps du premier tour. */
export const WELCOME_ORB_SIZE = 72
