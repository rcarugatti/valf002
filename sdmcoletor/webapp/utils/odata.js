export const readAsync = (oModel, sPath, urlParameters = {}) =>
  new Promise((resolve, reject) => {
    oModel.read(sPath, {
      urlParameters,
      success: (oData) => resolve(oData.results),
      error: reject,
    });
  });
