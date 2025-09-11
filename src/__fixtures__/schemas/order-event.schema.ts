import { z } from 'zod';
import { BaseEventSchema } from '../../schemas';

export const OrderEventSchema = BaseEventSchema.extend({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']),
  total: z.number().positive(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().positive(),
      price: z.number().positive()
    })
  )
});

export type OrderEvent = z.infer<typeof OrderEventSchema>;
