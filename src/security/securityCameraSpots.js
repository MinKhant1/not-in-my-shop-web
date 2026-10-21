// Wall anchors for the Security Camera upgrade.
// requiredSection is 1-based and follows the shop from west to east:
// 1 grocery, 2 electronics, 3 sports, 4 clothing, 5 jewellery.
// y is the floor anchor. The rig raises the bracket onto the north wall.
export const SECURITY_CAMERA_SPOTS = [
  { id: 1, position: { x: 2, y: 0, z: -4.5 }, requiredSection: 1 },
  { id: 2, position: { x: 10, y: 0, z: -4.5 }, requiredSection: 2 },
  { id: 3, position: { x: 17, y: 0, z: -4.5 }, requiredSection: 3 },
  { id: 4, position: { x: 24, y: 0, z: -4.5 }, requiredSection: 4 },
  { id: 5, position: { x: 30, y: 0, z: -4.5 }, requiredSection: 5 }
];
