export function getEstimatedDeliveryRange(orderDate) {
  if (!orderDate) {
    return null;
  }

  const startDate = new Date(orderDate);

  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  const earliestDate = new Date(startDate);
  earliestDate.setDate(earliestDate.getDate() + 5);

  const latestDate = new Date(startDate);
  latestDate.setDate(latestDate.getDate() + 7);

  const formatDate = (date) =>
    date.toLocaleDateString("en-PH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return `${formatDate(earliestDate)} – ${formatDate(latestDate)}`;
}
