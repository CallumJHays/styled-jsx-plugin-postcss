const { spawnSync } = require("child_process");
const path = require("path");

module.exports = function styledJsxPostcssPlugin(css, settings = {}) {
  const cssWithPlaceholders = css.replace(
    /%%styled-jsx-placeholder-(\d+)%%/g,
    (_, id) => `/*%%styled-jsx-placeholder-${id}%%*/`
  );

  let output;
  if (settings.deasync) {
    const deasyncPromise = require("deasync-promise");
    const { processor } = require("./processor");

    output = deasyncPromise(processor(cssWithPlaceholders, settings));
  } else {
    const result = spawnSync(
      "node",
      [path.resolve(__dirname, "processor.js")],
      {
        input: JSON.stringify({
          css: cssWithPlaceholders,
          settings,
        }),
        encoding: "utf8",
      }
    );

    if (result.status !== 0) {
      if (result.stderr.includes("Invalid PostCSS Plugin")) {
        let isNext = false;
        try {
          require.resolve("next");
          isNext = true;
        } catch (err) {}
        if (isNext) {
          console.error(
            "Next.js 9 default postcss support uses a non standard postcss config schema https://err.sh/next.js/postcss-shape, you must use the interoperable object-based format instead https://nextjs.org/docs/advanced-features/customizing-postcss-config"
          );
        }
      }

      throw new Error(`postcss failed with ${result.stderr}`);
    }

    output = JSON.parse(result.stdout);
  }

  const { css: outputCss, maybeWarning } = output;

  if (maybeWarning) {
    console.warn(maybeWarning);
  }

  return outputCss.replace(
    /\/\*%%styled-jsx-placeholder-(\d+)%%\*\//g,
    (_, id) => `%%styled-jsx-placeholder-${id}%%`
  );
};
