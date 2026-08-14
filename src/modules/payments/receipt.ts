import PDFDocument from 'pdfkit';

export interface ReceiptData {
  receiptNumber: string;
  paidAt: Date;
  paymentMethod: string;
  txRef: string;
  passengerName: string;
  passengerPhone: string;
  route: string;
  departureTime: Date;
  seatNumber: string;
  operator: string;
  amount: number;
  currency: string;
  charges?: number | null;
}

function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString('en-MW', { minimumFractionDigits: 2 })}`;
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).fillColor('#111827').text('FoodieBus', { align: 'center' });
    doc.fontSize(12).fillColor('#6b7280').text('Payment Receipt', { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(9)
      .fillColor('#9ca3af')
      .text(`Receipt #${data.receiptNumber}`, { align: 'center' })
      .text(`Issued ${data.paidAt.toISOString()}`, { align: 'center' });

    doc.moveDown().moveDown();
    doc.fontSize(11).fillColor('#111827');
    doc.text(`Amount Paid: ${money(data.amount, data.currency)}`, { continued: false });
    if (data.charges) {
      doc
        .fontSize(9)
        .fillColor('#6b7280')
        .text(`Processing fee: ${money(data.charges, data.currency)}`);
    }
    doc.moveDown();

    const divider = () => doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();

    divider();

    const row = (label: string, value: string) => {
      doc.fontSize(10).fillColor('#6b7280').text(label);
      doc.fillColor('#111827').text(value);
      doc.moveDown(0.4);
    };

    doc.moveDown();
    row('Transaction reference', data.txRef);
    row('Payment method', data.paymentMethod);
    row('Passenger', `${data.passengerName} (${data.passengerPhone})`);
    row('Journey', data.route);
    row('Departure', data.departureTime.toISOString());
    row('Seat', data.seatNumber);
    row('Operator', data.operator);

    doc.moveDown().moveDown();
    doc
      .fontSize(9)
      .fillColor('#9ca3af')
      .text('Thank you for travelling with FoodieBus.', { align: 'center' });

    doc.end();
  });
}
