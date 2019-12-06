/* Web Lic - Copyright (C) 2019 Remi Gagne */

export function hasProperty<T extends Item>(item: Item | null, prop: string): item is T {
	return (item != null) && item.hasOwnProperty(prop);
}

export function isItemSpecificType<T extends Item>(
	item: Item | null, itemType: ItemTypeNames
): item is T {
	return (item != null) && item.type === itemType;
}
