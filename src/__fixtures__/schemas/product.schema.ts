import { z } from 'zod';
import { BaseEventSchema } from '../../schemas';

export const ProductSchema = BaseEventSchema.extend({
  productId: z.string().uuid(),
  name: z.string(),
  price: z.number(),
  category: z.string(),
  description: z.string()
});

export type Product = z.infer<typeof ProductSchema>;
