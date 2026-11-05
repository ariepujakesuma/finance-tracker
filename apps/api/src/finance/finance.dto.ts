import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Min,
  ValidateIf,
} from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class EntryDto {
  @IsString() @MaxLength(120) name: string;
  @IsIn(['out', 'in', 'save']) flow: string;
  @IsOptional() @IsString() @MaxLength(60) bank?: string;
  @IsIn(['cicilan', 'rutin', 'sekali']) mode: string;
  @IsInt() @Min(0) amount: number;
  @Matches(MONTH) start: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) months?: number | null;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(40) holdingId?: string | null;
}

export class BulkEntriesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => EntryDto)
  entries: EntryDto[];
}

export class MonthDto {
  @IsObject() paid: Record<string, boolean>;
  @IsObject() amt: Record<string, number>;
}

export class HoldingDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(60) owner?: string;
  @IsOptional() @IsString() @MaxLength(120) purpose?: string;
  @IsOptional() @IsString() @MaxLength(60) place?: string;
  @IsIn(['rp', 'gram']) unit: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) value?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) grams?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) price?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) monthly?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONTH) since?: string | null;
  @IsOptional() @IsBoolean() estimate?: boolean;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE) priceDate?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) priceSource?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE) updated?: string | null;
}

export class GoalDto {
  @IsString() @MaxLength(120) name: string;
  @IsInt() @Min(1) target: number;
  @IsOptional() @IsInt() @Min(0) saved?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONTH) deadline?: string | null;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(40, { each: true }) holdingIds: string[];
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class BankDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
}

export class SettingsDto {
  @IsInt() @Min(0) threshold: number;
}

export class GoldPriceDto {
  @IsInt() @Min(1) price: number;
  @Matches(DATE) priceDate: string;
  @IsOptional() @IsString() @MaxLength(60) priceSource?: string;
}
