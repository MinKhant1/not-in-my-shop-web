export function findSceneObject(root, id) {
  if (!root || !id) {
    return null;
  }
  let byId = null;
  let byName = null;
  root.traverse((object) => {
    if (byId) {
      return;
    }
    if (object.userData?.editorId === id) {
      byId = object;
      return;
    }
    if (!byName && object.name === id) {
      byName = object;
    }
  });
  return byId || byName;
}
