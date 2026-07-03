"use client";

import clsx from "clsx";
import { useLocale } from "components/i18n/locale-context";
import { localeTag } from "lib/i18n/config";

const Price = ({
  amount,
  className,
  currencyCode = "USD",
  currencyCodeClassName,
}: {
  amount: string;
  className?: string;
  currencyCode: string;
  currencyCodeClassName?: string;
} & React.ComponentProps<"p">) => {
  const locale = useLocale();

  return (
    <p suppressHydrationWarning={true} className={className}>
      {`${new Intl.NumberFormat(localeTag(locale), {
        style: "currency",
        currency: currencyCode,
        currencyDisplay: "narrowSymbol",
      }).format(parseFloat(amount))}`}
      <span
        className={clsx("ml-1 inline", currencyCodeClassName)}
      >{`${currencyCode}`}</span>
    </p>
  );
};

export default Price;
